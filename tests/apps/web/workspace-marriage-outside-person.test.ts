// Spec: spec/federal/marketplace-marriage-outside-person.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarriageOutsidePersonState } from '../../fixtures/guided-marriage-outside-person';
vi.mock('server-only', () => ({}));

it('exports actual marriage and outside child sources through the workspace', async () => {
  const state = guidedMarriageOutsidePersonState(), before = JSON.stringify(state), workspace = createWorkspaceRecord('actual-shared-marriage-health'); workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state), dir = mkdtempSync(join(tmpdir(), 'workspace-shared-marriage-'));
  try {
    expect(download.includedForms).toContain('f8962-filled.pdf'); expect(download.includedForms).toContain('f8962-reference-filled.pdf');
    expect(download.includedForms.filter(path => path.includes('form-7206-'))).toHaveLength(1);
    const path = join(dir, 'review.pdf'); writeFileSync(path, download.contents);
    const saved: { pages: string[]; fields: string[] } = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages], 'fields':list((r.get_fields() or {}).keys())}))", path], { encoding: 'utf8', timeout: 5000 }));
    expect(saved.fields).toEqual([]);
    const text = saved.pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['Return-level Schedule 1 line 17 transfer: $6875', 'Final Form 8962 credit: $5192', 'Step 2 credit: $5725', 'Alternative Calculation for Year of Marriage', 'Pub974 Marriage Worksheet V', 'Actual child relationship son_or_daughter; began 1999-01-02', 'Completed other-return Form8962 line24 $0', 'Allocation of Policy Amounts']) expect(text).toContain(literal);
    for (const page of saved.pages) { expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2); expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666|234.?56.?7890/); }
    expect(JSON.stringify(state)).toBe(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
