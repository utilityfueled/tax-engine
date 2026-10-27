// Spec: charitable-cod-modified-composition.yaml workspace.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCharitableCodModifiedState } from '../../fixtures/guided-charitable-cod-modified';
vi.mock('server-only', () => ({}));

it('exports actual guided charitable and COD sources with separate closing vectors', async () => {
  const state = guidedCharitableCodModifiedState(), before = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-charitable-cod'); workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const directory = await mkdtemp(join(tmpdir(), 'charitable-cod-workspace-'));
  try {
    const path = join(directory, 'actual-review.pdf'); await writeFile(path, result.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
    pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['Regular NOL before COD: claimed 39200', 'Alternative NOL before COD: claimed 84600',
      'Regular COD: before 60800; reduction 5000; expiry 0; remaining 55800',
      'Alternative COD: before 15400; reduction 5000; expiry 0; remaining 10400',
      'Regular COD charitable comparison: before 51392; remaining 46392; original NOL difference 9408; after COD difference 9408']) expect(text).toContain(literal);
    for (const secret of ['111-22-3333', '111223333', 'Original account-A', 'Original statement-A', '12-3456789']) expect(text).not.toContain(secret);
    expect(text).toContain('Packet completeness status: partial.'); expect(state).toEqual(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Spec: charitable-cod-modified-composition.yaml saved-unconfirmed.
it('rejects saved unconfirmed regular charity before review output', async () => {
  const workspace = createWorkspaceRecord('synthetic-charitable-cod-pending'); workspace.returnSummary.targetTaxYear = 2025;
  for (const confirmation of [false, null, undefined]) {
    const state = guidedCharitableCodModifiedState(), history = state.sectionData.deductions?.charitableCarryoverSources;
    if (!history) throw new Error('Missing actual fictional charitable history'); history.sourceFactsConfirmed = confirmation;
    const saved = JSON.parse(JSON.stringify(state));
    await expect(buildWorkspaceFilledReturnDownload(workspace, saved)).rejects.toThrow();
    expect(saved.sectionData.deductions.charitableCarryoverSources.sourceFactsConfirmed).toBe(confirmation);
  }
});
