// Spec: spec/federal/education-annual-category-limits.yaml workspace.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { actualGuidedAnnualCategory } from '../../fixtures/guided-annual-category-limits';
import { requiredPeriodSource as required } from '../../fixtures/guided-room-board-periods';
vi.mock('server-only', () => ({}));
it.each([false, true])('downloads actual category sources with local review privacy', async (apprenticeship) => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-annual-category-'));
  const workspace = createWorkspaceRecord('fictional-annual-category-review'); workspace.returnSummary.targetTaxYear = 2025; workspace.returnSummary.taxYearState = 'single';
  try {
    const { state } = actualGuidedAnnualCategory(apprenticeship), before = JSON.stringify(state);
    const download = await buildWorkspaceFilledReturnDownload(workspace, state);
    expect(download.includedForms).toContain('f1099q-reference-filled.pdf');
    const path = join(directory, `${apprenticeship ? 'apprenticeship' : 'k12'}.pdf`); await writeFile(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 30000 }));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['Statement 1: Annual cash gross: $30000', `Statement 1: Annual qualified cash expenses: $${apprenticeship ? '6000' : '10000'}`,
      `Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $${apprenticeship ? '7200' : '6000'}`,
      `Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $${apprenticeship ? '720' : '600'}`]) expect(text).toContain(literal);
    for (const page of pages) expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
    for (const secret of ['123456789', '123-45-6789', 'fictional-cash-first', 'fictional-cash-second']) expect(text).not.toContain(secret);
    expect(JSON.stringify(state)).toBe(before);
    const missing = structuredClone(state); required(missing.sectionData.credits?.educationDistributions).sourceFactsConfirmed = null;
    await expect(buildWorkspaceFilledReturnDownload(workspace, missing)).rejects.toThrow(/complete|source|confirm/i);
    const next = structuredClone(state); next.taxYear = 2026;
    await expect(buildWorkspaceFilledReturnDownload(workspace, next)).rejects.toThrow(/year|2026|source/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
