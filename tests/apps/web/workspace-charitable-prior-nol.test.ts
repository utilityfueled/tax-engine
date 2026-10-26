// Spec: charitable-prior-net-operating-loss.yaml workspace-packet.
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { priorCharitableNolInterview } from '../../fixtures/guided-charitable-prior-nol';

vi.mock('server-only', () => ({}));
it('exports the actual guided prior charity calculation through the private workspace packet', async () => {
  const state = priorCharitableNolInterview(), workspace = createWorkspaceRecord('synthetic-prior-charity');
  workspace.returnSummary.targetTaxYear = 2025;
  const original = structuredClone(state), result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: result.contents, encoding: 'utf8' })) as string[];
  for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  const text = pages.join(' ').replace(/\s+/g, ' ');
  expect(text).toContain('Prior regular charitable carry from 2024');
  expect(text).toContain('remaining 23360'); expect(text).toContain('Current AMT charity adjustment 3200');
  for (const value of ['111-22-3333', '111223333', 'synthetic-regular-2024', 'synthetic-alternative-2024', 'Synthetic independent AMT charitable worksheet']) expect(text).not.toContain(value);
  expect(state).toEqual(original);
  const missing = priorCharitableNolInterview();
  const history = missing.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory;
  if (!history) throw new Error('Missing fictional prior history');
  history.alternativeCarryoverSources = undefined;
  await expect(buildWorkspaceFilledReturnDownload(workspace, missing)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
