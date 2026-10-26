// Spec: spec/federal/education-ordinary-expense-composition.yaml.
import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { actualGuidedOrdinaryEducationExpenses } from '../../fixtures/guided-ordinary-education-expenses';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
vi.mock('server-only', () => ({}));

it('reopens an actual ordinary education expense workspace review', async () => {
  const { state, original } = actualGuidedOrdinaryEducationExpenses(), before = structuredClone(state);
  const workspace = createWorkspaceRecord('fictional-ordinary-education', { now: '2026-10-26T00:00:00.000Z' });
  workspace.returnSummary.targetTaxYear = 2025;
  const directory = await mkdtemp(join(tmpdir(), 'ordinary-education-workspace-'));
  try {
    const download = await buildWorkspaceFilledReturnDownload(workspace, state), path = join(directory, 'review.pdf');
    await writeFile(path, download.contents);
    expect(download.includedForms).toContain('f5329-primary-filled.pdf'); expect(download.includedForms).toContain('f1099q-reference-filled.pdf');
    const checked: { pages: string[]; fields: number } = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({"pages":[p.extract_text() or "" for p in r.pages],"fields":len(r.get_fields() or {})}))', path], { encoding: 'utf8', timeout: 10000 }));
    const text = checked.pages.join(' ').replace(/\s+/g, ' ');
    for (const amount of ['Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $300',
      'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $30',
      'Expense 1: Category: postsecondary_books', 'Actual received date: 2025-09-15']) expect(text).toContain(amount);
    expect(checked.fields).toBe(0);
    for (const page of checked.pages) {
      expect(page).toContain(REVIEW_PDF_NOTICE);
      for (const secret of [original.taxpayer.primary.ssn, 'prepaid-account', 'fictional institution refund receipt']) expect(page).not.toContain(secret);
    }
    expect(state).toEqual(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
