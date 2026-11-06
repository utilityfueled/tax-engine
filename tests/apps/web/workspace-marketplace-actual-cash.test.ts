// Spec: spec/federal/marketplace-actual-cash-health.yaml, workspace.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceActualCashState } from '../../fixtures/guided-marketplace-actual-cash';
vi.mock('server-only', () => ({}));

it('downloads the actual cash payment review without replacing original policies', async () => {
  const state = guidedMarketplaceActualCashState(true), before = structuredClone(state), workspace = createWorkspaceRecord('synthetic-actual-cash');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  const dir = mkdtempSync(join(tmpdir(), 'tax-workspace-actual-cash-'));
  try {
    const path = join(dir, 'actual-review.pdf'); writeFileSync(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader;import json,sys;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 5000 }));
    expect(pages.join(' ')).toContain('ACTUAL CASH WITH ZERO FINAL CREDIT');
    expect(pages.join(' ')).toContain('actual coverage-family cash $300');
    expect(pages.join(' ')).toContain('actual noncoverage-family cash $150');
    expect(pages.join(' ')).toContain('original premium $1875');
    expect(pages.join(' ')).toContain('owner/business paid $450');
    for (const page of pages) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321|234.?56.?7890/); }
    expect(state).toEqual(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
