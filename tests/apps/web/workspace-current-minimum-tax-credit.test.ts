// Spec: current-minimum-tax-credit-sources.yaml workspace-output.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCurrentMtcState } from '../../fixtures/guided-current-minimum-tax-credit';
vi.mock('server-only', () => ({}));

it.each([false, true])('reopens source-complete signed MTC guided packets (reversal=%s)', async reversal => {
  const state = guidedCurrentMtcState(reversal), before = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-current-mtc'); workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  const directory = await mkdtemp(join(tmpdir(), 'current-mtc-workspace-'));
  try {
    const path = join(directory, 'actual-review.pdf'); await writeFile(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
    pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain(`Signed current-year minimum tax credit adjustment: ${reversal ? '-41639' : '41639'}`);
    expect(text).toContain(`Minimum tax credit aggregate after COD: ${reversal ? '17900' : '41539'}`);
    if (reversal) expect(text).toContain('Current full Form8801 credit used: 10361');
    for (const secret of ['123-45-6789', '123456789', 'adjustment-original-A']) expect(text).not.toContain(secret);
    // The established policy keeps actual business identity on Schedule E.
    // New numeric references must not copy the private original labels there.
    const reference = text.slice(text.indexOf('Form 982 Insolvency and Attribute Reduction Reference Summary'));
    for (const secret of ['12-3456789', 'Actual depreciation source']) expect(reference).not.toContain(secret);
    expect(text).toContain('Packet completeness status: partial.'); expect(state).toEqual(before);
    state.sectionData.adjustments!.codNolSources!.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.sourceFactsConfirmed = null;
    await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
