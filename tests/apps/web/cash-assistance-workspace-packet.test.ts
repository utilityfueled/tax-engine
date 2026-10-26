// Spec: spec/federal/form-1099-q-cash-assistance.yaml.
import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { actualGuidedCashAssistance } from '../../fixtures/guided-cash-assistance';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
vi.mock('server-only', () => ({}));

it('reopens the actual cash assistance workspace packet', async () => {
  const { state, original } = actualGuidedCashAssistance(), before = structuredClone(state);
  const workspace = createWorkspaceRecord('fictional-cash-assistance', { now: '2026-10-26T00:00:00.000Z' });
  workspace.returnSummary.targetTaxYear = 2025;
  const directory = await mkdtemp(join(tmpdir(), 'cash-assistance-workspace-'));
  try {
    const download = await buildWorkspaceFilledReturnDownload(workspace, state), path = join(directory, 'review.pdf');
    await writeFile(path, download.contents);
    expect(download.includedForms).toContain('f5329-primary-filled.pdf'); expect(download.includedForms).toContain('f1099q-reference-filled.pdf');
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 10000 }));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const amount of ['Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $975',
      'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $75', 'Distribution form: Cash distribution']) expect(text).toContain(amount);
    for (const page of pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'fictional-cash-qtp-account']) expect(page).not.toContain(secret);
    }
    expect(state).toEqual(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
