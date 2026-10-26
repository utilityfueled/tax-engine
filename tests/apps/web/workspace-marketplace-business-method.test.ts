// Spec: spec/federal/marketplace-business-credit-method.yaml.
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedMarketplaceBusinessCreditMethodState } from '../../fixtures/guided-marketplace-business-credit-method';

vi.mock('server-only', () => ({}));
it('exports the recorded business method through the original guided workspace context', async () => {
  const state = guidedMarketplaceBusinessCreditMethodState(), before = structuredClone(state), workspace = createWorkspaceRecord('synthetic-recorded-health-method');
  workspace.returnSummary.targetTaxYear = 2025;
  const result = await buildWorkspaceFilledReturnDownload(workspace, state);
  const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
  { input: result.contents, encoding: 'utf8', timeout: 5000 })) as string[];
  const text = pages.join(' ').replace(/\s+/g, ' ');
  for (const value of ['monthly_eligible_plan_enrollment', 'Schedule 1 line 17 transfer: $3000', 'Final Form 8962 credit: $11658', 'Allocated Step2 credit $7200', 'Allocated Step2 credit $4800']) expect(text).toContain(value);
  for (const page of pages) { expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2); expect(page).not.toMatch(/123.?45.?6789|987.?65.?4321/); }
  expect(state).toEqual(before);
  const missing = guidedMarketplaceBusinessCreditMethodState(); missing.sectionData.adjustments!.healthInsuranceFacts!.marketplaceCreditAllocation!.sourceFactsConfirmed = null;
  await expect(buildWorkspaceFilledReturnDownload(workspace, missing)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
});
