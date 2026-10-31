// Spec: charitable-original-source-nol.yaml workspace.
import { execFileSync } from '../../helpers/file-stdin-exec';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedOriginalCharitableNolState } from '../../fixtures/guided-charitable-original-source-nol';

vi.mock('server-only', () => ({}));
it('exports the actual guided original K1 and NOL sources through the private workspace packet', async () => {
  const state = guidedOriginalCharitableNolState(), workspace = createWorkspaceRecord('fictional-original-charity');
  workspace.returnSummary.targetTaxYear = 2025;
  const original = structuredClone(state), result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: result.contents, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const value of ['remaining 33360', 'Separate alternative-tax charitable carry 46800', 'Original qualified contributions 60000']) expect(text).toContain(value);
  for (const value of ['111-22-3333', '111223333', 'original-gift-1', 'Fictional original basis worksheet']) expect(text).not.toContain(value);
  // Existing render policy preserves explicit business EINs on basis references.
  expect(text).toContain('EIN: 98-7654321');
  expect(state).toEqual(original);
  const missing = guidedOriginalCharitableNolState();
  if (!missing.sectionData.adjustments?.netOperatingLossSources?.alternativeTax) throw new Error('Missing fictional source');
  missing.sectionData.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory = undefined;
  await expect(buildWorkspaceFilledReturnDownload(workspace, missing)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
