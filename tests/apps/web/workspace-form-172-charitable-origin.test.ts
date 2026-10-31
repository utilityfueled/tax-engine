// Spec: spec/federal/form-172-charitable-origin.yaml workspace-current-sources.
import { execFileSync } from '../../helpers/file-stdin-exec';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCurrentCharitableOriginState } from '../../fixtures/guided-form-172-charitable-origin';

vi.mock('server-only', () => ({}));
it('exports actual guided charitable origins without inventing source history', async () => {
  const state = guidedCurrentCharitableOriginState(), original = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-current-charitable-origin');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: result.contents, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const value of ['20000.49', '14000.49', 'Current regular PartI loss 16000', 'Current alternative PartI loss 0']) expect(text).toContain(value);
  for (const value of ['111-22-3333', '111223333', 'Fictional independent current-origin charity histories']) expect(text).not.toContain(value);
  expect(JSON.stringify(state)).toBe(original);
  const alternative = state.sectionData.adjustments?.netOperatingLossSources?.alternativeTax;
  if (!alternative) throw new Error('Missing fictional current-origin history');
  alternative.charitableCarryoverHistory = undefined;
  await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
