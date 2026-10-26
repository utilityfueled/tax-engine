// Spec: spec/federal/charitable-k1-basis-release-nol.yaml workspace.
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCharitableK1ReleaseState } from '../../fixtures/guided-charitable-k1-release-nol';
vi.mock('server-only', () => ({}));

it('exports actual prior basis release and independent NOL histories without a bridge mock', async () => {
  const state = guidedCharitableK1ReleaseState(), before = JSON.stringify(state), workspace = createWorkspaceRecord('fictional-basis-release');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: result.contents, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const value of ['remaining 33360','Separate alternative-tax charitable carry 46800','original year 2018; prior basis source',
    'Basis previously allowed: $20000; basis allowed this year: $60000','Basis suspended: $0']) expect(text).toContain(value);
  for (const value of ['111-22-3333','111223333','actual-prior-basis-2018','Fictional original2018']) expect(text).not.toContain(value);
  expect(JSON.stringify(state)).toBe(before);
  const missing = guidedCharitableK1ReleaseState(), basis = missing.sectionData.deductions?.k1CharitableSources?.statements?.[0].basis;
  if (!basis) throw new Error('Missing fictional basis'); basis.priorBasisHistoryComplete = false;
  await expect(buildWorkspaceFilledReturnDownload(workspace, missing)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
