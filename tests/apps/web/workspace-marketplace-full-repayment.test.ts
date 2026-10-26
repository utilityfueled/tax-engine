// Spec: spec/federal/marketplace-full-advance-repayment.yaml, workspace.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceFullRepaymentState } from '../../fixtures/guided-marketplace-full-repayment';
vi.mock('server-only', () => ({}));

it('downloads the actual guided full-repayment return without discarding original sources', async () => {
  const state = guidedMarketplaceFullRepaymentState(true), before = structuredClone(state), workspace = createWorkspaceRecord('synthetic-full-repayment');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  const dir = mkdtempSync(join(tmpdir(), 'tax-workspace-full-repayment-'));
  try {
    const path = join(dir, 'actual-review.pdf'); writeFileSync(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader;import json,sys;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 5000 }));
    expect(pages.join(' ')).toContain('ACTUAL ZERO CREDIT AND FULL ADVANCE REPAYMENT');
    expect(pages.join(' ')).toContain('actual final repayment $12000');
    expect(pages.join(' ')).toContain('original premium $3000');
    for (const page of pages) { expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING'); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321|234.?56.?7890/); }
    expect(state).toEqual(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
