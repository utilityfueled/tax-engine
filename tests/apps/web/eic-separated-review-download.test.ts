// Spec: spec/federal/eic-separated-review.yaml.
import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedEicSeparatedReviewState } from '../../fixtures/guided-eic-separated-review';
vi.mock('server-only', () => ({}));
function required<T>(v: T | undefined | null): T { if (v == null) throw new Error('Missing actual synthetic source'); return v; }
it('binds guided actual child sources before review redaction', async () => {
  const state = guidedEicSeparatedReviewState(false); state.phase = 'complete';
  state.completedSections = ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'];
  const personal = required(state.sectionData['personal-info']); const child = required(required(personal.dependents)[0]);
  child.ssn = ''; child.monthsLivedWithYou = '6';
  const original = required(required(required(personal.eicSeparatedSpouseSources).children)[0].original);
  original.ssn = ''; original.monthsLivedWithYou = '6';
  const before = JSON.stringify(state), workspace = createWorkspaceRecord('synthetic-eic-review');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  expect(download.includedForms).toContain('f1040sei-filled.pdf');
  const dir = await mkdtemp(join(tmpdir(), 'guided-eic-review-'));
  try {
    const path = join(dir, 'review.pdf'); await writeFile(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import json,sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);assert r.get_fields() is None;print(json.dumps([p.extract_text() or '' for p in r.pages]))", path],
      { encoding: 'utf8', timeout: 30_000 }));
    const physical = required(pages.find(text => text.includes('Qualifying Child Information') && text.includes('Alex Example')));
    expect(physical).toContain('7'); expect(pages.join(' ')).toContain('649');
    expect(pages.every(text => text.includes('FOR REVIEW ONLY - NOT FOR FILING'))).toBe(true);
    for (const secret of ['111223333', '111-22-3333', '222334444', 'Actual claimant records', 'Actual separation records', 'dependent:0']) expect(pages.join(' ')).not.toContain(secret);
    expect(JSON.stringify(state)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
