// Spec: spec/federal/marketplace-other-return-cash.yaml, workspace.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceOtherReturnCashState } from '../../fixtures/guided-marketplace-other-return-cash';
vi.mock('server-only', () => ({}));

it('downloads completed actual other return sources without transferring its credit or repayment', async () => {
  const state = guidedMarketplaceOtherReturnCashState('marriage'), before = structuredClone(state), workspace = createWorkspaceRecord('synthetic-other-cash');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state), dir = mkdtempSync(join(tmpdir(), 'tax-other-cash-workspace-'));
  try {
    const path = join(dir,'review.pdf'); writeFileSync(path,download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader;import json,sys;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{ encoding:'utf8',timeout:5000 }));
    const text = pages.join(' ').replace(/\s+/g,' ');
    for (const literal of ['Completed other-return Form8962 line24 $1000','gross insurer cash $100','net insurer cash $100','not included in deductible insurer cash','6875','Form 2210 is not auto-attached']) expect(text).toContain(literal);
    for (const page of pages) { expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2); expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666|234.?56.?7890/); }
    expect(state.sectionData.payments!.estimatedTaxFacts!.sourceFactsConfirmed).toBe(true); expect(state).toEqual(before);
  } finally { rmSync(dir,{ recursive:true,force:true }); }
});
