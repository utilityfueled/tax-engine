// Spec: spec/federal/marketplace-actual-paid-repayment.yaml, workspace.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceActualPaidState } from '../../fixtures/guided-marketplace-actual-paid';
vi.mock('server-only', () => ({}));

it('downloads actual marriage payer sources without importing other repayment', async () => {
  const state = guidedMarketplaceActualPaidState(true, false, true), before = structuredClone(state), workspace = createWorkspaceRecord('synthetic-actual-paid');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  const dir = mkdtempSync(join(tmpdir(), 'tax-workspace-actual-paid-'));
  try {
    const path = join(dir, 'actual-review.pdf'); writeFileSync(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader;import json,sys;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 5000 }));
    expect(pages.join(' ')).toContain('ACTUAL PAYER CASH AND OWN-RETURN REPAYMENT');
    expect(pages.join(' ')).toContain('All original policy advances $14000');
    expect(pages.join(' ')).toContain('reported own-return repayment $7000');
    expect(pages.join(' ')).toContain('original premium $2000');
    expect(pages.join(' ')).toContain('owner/business paid $200');
    for (const page of pages) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666|234.?56.?7890/); }
    expect(state).toEqual(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
